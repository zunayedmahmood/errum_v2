'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import AccessDenied from '@/components/AccessDenied';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import FieldsSidebar from '@/components/product/FieldsSidebar';
import DynamicFieldInput from '@/components/product/DynamicFieldInput';
import VariationCard from '@/components/product/VariationCard';
import ImageGalleryManager from '@/components/product/ImageGalleryManager';
import CategoryTreeSelector from '@/components/product/CategoryTreeSelector';
import { productService, Field, Product } from '@/services/productService';
import productImageService from '@/services/productImageService';
import categoryService, { Category, CategoryTree } from '@/services/categoryService';
import { vendorService, Vendor } from '@/services/vendorService';
import { sizeService, Size } from '@/services/sizeService';
import {
  FieldValue,
  CategorySelectionState,
  VariationData,
  FALLBACK_IMAGE_URL,
} from '@/types/product';
import { SIZE_PRESETS, getPresetLabel, type SizePresetKey } from '@/data/sizePresets';

interface AddEditProductPageProps {
  productId?: string;
  mode?: 'create' | 'edit' | 'addVariation';
  baseSku?: string;
  baseName?: string;
  categoryId?: string;
  onBack?: () => void;
  onSuccess?: () => void;
}

export default function AddEditProductPage({
  productId: propProductId,
  mode: propMode = 'create',
  baseSku: propBaseSku = '',
  baseName: propBaseName = '',
  categoryId: propCategoryId = '',
  onBack,
  onSuccess,
}: AddEditProductPageProps) {
  const router = useRouter();
  const { permissionsResolved, isRole } = useAuth();
  const canAccess = isRole(['super-admin', 'admin', 'online-moderator']);
  const [modeResolved, setModeResolved] = useState(false);

  // Read from sessionStorage if props not provided
  const [productId, setProductId] = useState<string | undefined>(propProductId);
  const [mode, setMode] = useState<'create' | 'edit' | 'addVariation'>(propMode);
  const [storedBaseSku, setStoredBaseSku] = useState(propBaseSku);
  const [storedBaseName, setStoredBaseName] = useState(propBaseName);
  const [storedCategoryId, setStoredCategoryId] = useState(propCategoryId);
  const [storedVendorId, setStoredVendorId] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined' && !propProductId) {
      const storedProductId = sessionStorage.getItem('editProductId');
      const storedMode = sessionStorage.getItem('productMode');
      const storedSku = sessionStorage.getItem('baseSku');
      const storedName = sessionStorage.getItem('baseName');
      const storedCatId = sessionStorage.getItem('categoryId');
      const storedVid = sessionStorage.getItem('vendorId');

      if (storedProductId) {
        setProductId(storedProductId);
        sessionStorage.removeItem('editProductId');
      }

      if (storedMode) {
        setMode(storedMode as 'create' | 'edit' | 'addVariation');
        sessionStorage.removeItem('productMode');
      }

      if (storedSku) {
        setStoredBaseSku(storedSku);
        sessionStorage.removeItem('baseSku');
      }

      if (storedName) {
        setStoredBaseName(decodeURIComponent(storedName));
        sessionStorage.removeItem('baseName');
      }

      if (storedCatId) {
        setStoredCategoryId(storedCatId);
        sessionStorage.removeItem('categoryId');
      }

      if (storedVid) {
        setStoredVendorId(storedVid);
        sessionStorage.removeItem('vendorId');
      }
    }
    setModeResolved(true);
  }, [propProductId]);

  const isEditMode = mode === 'edit';
  const addVariationMode = mode === 'addVariation';

  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'general' | 'variations'>('general');
  const [loading, setLoading] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [hasVariations, setHasVariations] = useState<boolean>(false);

  // SKU group (all products that share the same SKU)
  const [skuGroupProducts, setSkuGroupProducts] = useState<Product[]>([]);
  const [skuGroupLoading, setSkuGroupLoading] = useState<boolean>(false);

  // Current product being edited (single variant)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Edit-mode helpers (for single variant name editing with new schema)
  const [editVariationSuffix, setEditVariationSuffix] = useState<string>('');

  // Variations tab quick edit (edit multiple variants from one view)
  const [quickEditMode, setQuickEditMode] = useState<boolean>(false);
  const [rowEdits, setRowEdits] = useState<Record<number, {
    variation_suffix: string;
    description: string;
  }>>({});
  const [savingRowIds, setSavingRowIds] = useState<Record<number, boolean>>({});
  const [savingAll, setSavingAll] = useState<boolean>(false);

  // "Update image for entire SKU" toggle (edit mode only)
  const [updateImageForEntireSku, setUpdateImageForEntireSku] = useState<boolean>(false);
  const [skuImagesSaving, setSkuImagesSaving] = useState<boolean>(false);

  // Common Edit (SKU group) state
  const [commonBaseName, setCommonBaseName] = useState<string>('');
  const [commonBrand, setCommonBrand] = useState<string>('');
  const [applyCommonDescription, setApplyCommonDescription] = useState<boolean>(false);
  const [applyCommonCategory, setApplyCommonCategory] = useState<boolean>(false);
  const [applyCommonVendor, setApplyCommonVendor] = useState<boolean>(false);
  const [applyCommonBrand, setApplyCommonBrand] = useState<boolean>(false);
  const [commonSaving, setCommonSaving] = useState<boolean>(false);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
  });

  const [categorySelection, setCategorySelection] = useState<CategorySelectionState>({});
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [productImages, setProductImages] = useState<any[]>([]);

  const [availableFields, setAvailableFields] = useState<Field[]>([]);
  const [selectedFields, setSelectedFields] = useState<FieldValue[]>([]);
  const [variations, setVariations] = useState<VariationData[]>([]);
  const [categories, setCategories] = useState<CategoryTree[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [allSizes, setAllSizes] = useState<Size[]>([]);

  useEffect(() => {
    const fetchSizes = async () => {
      try {
        const sizes = await sizeService.getSizes();
        setAllSizes(sizes);
      } catch (error) {
        console.error('Failed to fetch sizes:', error);
      }
    };
    fetchSizes();
  }, []);


  // --- Size presets (Errum): quickly select full size chart for a category ---
  const findCategoryNameById = (nodes: CategoryTree[], id: string): string => {
    const target = String(id || '').trim();
    if (!target) return '';
    const stack: any[] = Array.isArray(nodes) ? [...nodes] : [];
    while (stack.length) {
      const node: any = stack.pop();
      if (!node) continue;
      if (String(node.id) === target) return String(node.name || '');
      const children = (node.children || node.all_children || []) as any[];
      if (Array.isArray(children) && children.length) stack.push(...children);
    }
    return '';
  };

  const selectedCategoryName = (() => {
    const id = categorySelection.level0 ? String(categorySelection.level0) : '';
    return id ? findCategoryNameById(categories, id) : '';
  })();

  const sizeContext = (() => {
    const name = String(selectedCategoryName || '').toLowerCase();

    const footwearKeywords = [
      'shoe',
      'shoes',
      'sneaker',
      'sneakers',
      'footwear',
      'boot',
      'boots',
      'sandal',
      'sandals',
      'loafer',
      'loafers',
      'heel',
      'heels',
    ];

    const apparelKeywords = [
      'dress',
      'dresses',
      'apparel',
      'clothing',
      't-shirt',
      'tshirt',
      'shirt',
      'tops',
      'top',
      'pant',
      'pants',
      'trouser',
      'trousers',
      'jeans',
      'kurti',
      'kameez',
      'salwar',
      'saree',
      'sari',
      'jacket',
      'hoodie',
      'sweater',
      'blouse',
      'skirt',
      'abaya',
    ];

    const isFootwear = footwearKeywords.some((k) => name.includes(k));
    const isApparel = apparelKeywords.some((k) => name.includes(k));

    // Combine hardcoded presets with DB sizes if they match
    const dbSizes = allSizes.map(s => s.name);

    if (isFootwear) return { options: [...new Set([...(SIZE_PRESETS.sneakers as any), ...dbSizes])] };
    if (isApparel) return { options: [...new Set([...(SIZE_PRESETS.dresses as any), ...dbSizes])] };
    return { options: dbSizes };
  })();

  const getSizeOptionsForVariation = (sizes: string[]): string[] | undefined => {
    const dbSizes = allSizes.map(s => s.name);
    const contextOptions = sizeContext.options || [];
    
    const existing = (Array.isArray(sizes) ? sizes : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean);

    return Array.from(new Set([...contextOptions, ...dbSizes, ...existing]));
  };

  const sizePresetButtons = [
    { key: 'sneakers', label: getPresetLabel('sneakers') },
    { key: 'dresses', label: getPresetLabel('dresses') },
  ];

  const applySizePreset = (variationId: string, presetKey: SizePresetKey) => {
    const preset = Array.isArray(SIZE_PRESETS[presetKey]) ? Array.from(SIZE_PRESETS[presetKey]) : [];
    if (preset.length === 0) return;

    setVariations((prev) =>
      prev.map((v) => {
        if (v.id !== variationId) return v;
        const existing = (Array.isArray(v.sizes) ? v.sizes : [])
          .map((s) => String(s || '').trim())
          .filter(Boolean);
        const merged = Array.from(new Set([...existing, ...preset]));
        return { ...v, sizes: merged.length > 0 ? merged : [''] };
      })
    );
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (isEditMode && productId && availableFields.length > 0) {
      fetchProduct();
    } else if (addVariationMode) {
      setFormData({
        name: storedBaseName,
        sku: storedBaseSku,
        description: '',
      });
      setCategorySelection({ level0: storedCategoryId });
      if (storedVendorId) {
        setSelectedVendorId(String(storedVendorId));
      }
      setHasVariations(true);
      setActiveTab('general');
    }
  }, [isEditMode, productId, availableFields, addVariationMode, storedBaseName, storedBaseSku, storedCategoryId, storedVendorId]);

  useEffect(() => {
    if (hasVariations && !isEditMode) {
      setActiveTab('variations');
    }
  }, [hasVariations, isEditMode]);

  // In edit mode, fetch SKU group by product id (backend provides /sku-group)
  useEffect(() => {
    if (!isEditMode) return;
    if (!productId) return;
    fetchSkuGroupByProductId(productId);
  }, [isEditMode, productId]);

  /**
   * Normalize category tree so sub-categories always render.
   *
   * Some API responses return nested nodes in `all_children` (and may omit `children`).
   * Our UI (CategoryTreeSelector) prefers `children`, so we unify both into `children`.
   */
  const filterActiveCategories = (cats: CategoryTree[]): CategoryTree[] => {
    const getChildren = (cat: CategoryTree): CategoryTree[] => {
      const rawChildren = (cat as any)?.children;
      const rawAllChildren = (cat as any)?.all_children;

      if (Array.isArray(rawChildren) && rawChildren.length > 0) return rawChildren;
      if (Array.isArray(rawAllChildren) && rawAllChildren.length > 0) return rawAllChildren;
      return [];
    };

    return (Array.isArray(cats) ? cats : [])
      .filter((cat) => Boolean(cat) && Boolean((cat as any).is_active))
      .map((cat) => {
        const nested = filterActiveCategories(getChildren(cat));
        return {
          ...cat,
          children: nested,
          // keep for backward-compatibility, but ensure it doesn't shadow children
          all_children: nested,
        } as CategoryTree;
      });
  };

  const fetchInitialData = async () => {
    try {
      setLoading(true);

      const fieldsData = await productService.getAvailableFields();
      setAvailableFields(Array.isArray(fieldsData) ? fieldsData : []);

      const categoriesData = await categoryService.getTree(true);

      const filteredCategories = filterActiveCategories(
        Array.isArray(categoriesData) ? categoriesData : []
      );
      setCategories(filteredCategories);

      const vendorsData = await vendorService.getAll({ is_active: true });
      const vendorsList = Array.isArray(vendorsData) ? vendorsData : [];
      setVendors(vendorsList);
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
      setToast({ message: 'Failed to load page data. Please refresh.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchProduct = async () => {
    if (!productId) return;

    try {
      setLoading(true);
      const product = await productService.getById(productId);

      console.log('Fetched product:', product);

      setEditingProduct(product);
      setFormData({
        // In the new schema, UI field represents base_name.
        name: (product as any).base_name || product.name,
        sku: product.sku,
        description: product.description || '',
      });

      // Keep suffix editable in edit mode (so user can update a single variant's name)
      setEditVariationSuffix(String((product as any).variation_suffix || '').trim());

      setSelectedVendorId(String(product.vendor_id));
      setCategorySelection({ level0: String(product.category_id) });

      // ImageGalleryManager will fetch and display images automatically when productId is provided
      // No need to manually fetch images here

      // IMPORTANT: In edit mode, we are editing a single product (one variant).
      // We should still allow image editing and field editing for this product.
      // So we do NOT auto-enable "hasVariations" (which is creation-mode UI).

      const baseFields: FieldValue[] = (Array.isArray(product.custom_fields) ? product.custom_fields : [])
        .filter(cf => !['Primary Image', 'Additional Images', 'SKU', 'Product Name', 'Description', 'Category', 'Vendor'].includes(cf.field_title))
        .map(cf => ({
          fieldId: cf.field_id,
          fieldName: cf.field_title,
          fieldType: cf.field_type,
          value: cf.value,
          instanceId: `field-${cf.field_id}-${Date.now()}`,
        }));

      // ✅ In edit mode, always show Color/Size so users can fix missing variant info.
      const norm = (s: any) => String(s || '').trim().toLowerCase();
      const colorDef = availableFields.find(f => ['color', 'colour'].includes(norm(f.title)));
      const sizeDef = availableFields.find(f => norm(f.title) === 'size');

      const enhancedFields: FieldValue[] = [...baseFields];

      if (isEditMode && sizeDef) {
        const hasSize = enhancedFields.some(f => f.fieldId === sizeDef.id || norm(f.fieldName) === 'size');
        if (!hasSize) {
          enhancedFields.unshift({
            fieldId: sizeDef.id,
            fieldName: sizeDef.title,
            fieldType: sizeDef.type,
            value: '',
            instanceId: `field-${sizeDef.id}-${Date.now()}-auto`,
          });
        }
      }

      if (isEditMode && colorDef) {
        const hasColor = enhancedFields.some(
          f => f.fieldId === colorDef.id || ['color', 'colour'].includes(norm(f.fieldName))
        );
        if (!hasColor) {
          enhancedFields.unshift({
            fieldId: colorDef.id,
            fieldName: colorDef.title,
            fieldType: colorDef.type,
            value: '',
            instanceId: `field-${colorDef.id}-${Date.now()}-auto`,
          });
        }
      }

      setSelectedFields(enhancedFields);
    } catch (error) {
      console.error('Failed to fetch product:', error);
      setToast({ message: 'Failed to load product', type: 'error' });
      handleBack();
    } finally {
      setLoading(false);
    }
  };

  const parseVariantFromName = (name: string): { base?: string; color?: string; size?: string } => {
    const raw = (name || "").trim();
    if (!raw) return {};

    // Use a stricter split that requires spaces around hyphens to distinguish from hyphens in product names (e.g., "Premium-Quality")
    const parts = raw.split(/\s+-\s+/).map(p => p.trim()).filter(Boolean);

    if (parts.length >= 3) {
      const size = parts[parts.length - 1];
      const color = parts[parts.length - 2];
      const base = parts.slice(0, parts.length - 2).join(" - ").trim();
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

  const getVariantAttr = (p: Product): { color?: string; size?: string } => {
    const colorField = p.custom_fields?.find(cf => String(cf.field_title || '').trim().toLowerCase() === 'color');
    const sizeField = p.custom_fields?.find(cf => String(cf.field_title || '').trim().toLowerCase() === 'size');
    const color = colorField?.value;
    const size = sizeField?.value;
    if (color || size) return { color, size };
    // Prefer backend-provided variation_suffix (e.g. "-red-30") when custom fields are missing
    const suffix = String((p as any).variation_suffix || '').trim();
    if (suffix) {
      const parts = suffix.split('-').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        return { color: parts[parts.length - 2], size: parts[parts.length - 1] };
      }
      if (parts.length === 1) return { color: parts[0] };
    }
    const parsed = parseVariantFromName(p.name);
    return { color: parsed.color, size: parsed.size };
  };

  const getGroupBaseName = (items: Product[], fallback: string) => {
    // 1. First priority: Prefer explicit base_name stored in the database
    const explicitBases = items
      .map(v => String((v as any).base_name || "").trim())
      .filter(Boolean);

    if (explicitBases.length > 0) {
      // Find the most frequent explicit base_name
      const counts = new Map<string, number>();
      explicitBases.forEach(b => counts.set(b, (counts.get(b) || 0) + 1));

      let best = explicitBases[0];
      let max = -1;
      for (const [val, count] of counts.entries()) {
        if (count > max) {
          max = count;
          best = val;
        }
      }
      return best;
    }

    // 2. Second priority: Guessed bases from full product names
    const guessedBases = items
      .map(v => (parseVariantFromName(v.name).base || "").trim())
      .filter(Boolean);

    if (guessedBases.length === 0) return fallback;

    const counts = new Map<string, number>();
    const originalMap = new Map<string, string>();
    guessedBases.forEach(b => {
      const key = b.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!originalMap.has(key)) originalMap.set(key, b);
    });

    let bestKey = "";
    let bestCount = -1;
    let bestLen = -1; // Changed from Infinity to -1 to prefer LONGER names when tied

    for (const [key, c] of counts.entries()) {
      const candidate = originalMap.get(key) || key;
      const len = candidate.length;

      // Prefer higher count, OR longer name if counts are equal (avoids truncated guesses)
      if (c > bestCount || (c === bestCount && len > bestLen)) {
        bestKey = key;
        bestCount = c;
        bestLen = len;
      }
    }
    return (originalMap.get(bestKey) || fallback).trim();
  };

  const getImageUrl = (imagePath: string | null | undefined): string | null => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http')) return imagePath;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';
    return `${baseUrl}/storage/${imagePath}`;
  };

  const fetchSkuGroupByProductId = async (id: string | number) => {
    const pid = String(id || '').trim();
    if (!pid) {
      setSkuGroupProducts([]);
      return;
    }

    try {
      setSkuGroupLoading(true);
      const group = await productService.getSkuGroup(pid);

      const list = Array.isArray(group.products) ? [...group.products] : [];

      // Sort by color then size (for nicer display)
      list.sort((a, b) => {
        const av = getVariantAttr(a);
        const bv = getVariantAttr(b);
        const c1 = String(av.color || '').localeCompare(String(bv.color || ''));
        if (c1 !== 0) return c1;
        return String(av.size || '').localeCompare(String(bv.size || ''));
      });

      setSkuGroupProducts(list);
      setCommonBaseName(String(group.base_name || ''));

      // Initialize quick-edit rows so the "old" edit style (edit within variations view) works
      const initialEdits: Record<number, { variation_suffix: string; description: string }> = {};
      for (const p of list) {
        initialEdits[p.id] = {
          variation_suffix: String((p as any).variation_suffix || '').trim(),
          description: String((p as any).description || ''),
        };
      }
      setRowEdits(initialEdits);

      // Keep UI SKU in sync
      if (String(group.sku || '').trim()) {
        setFormData(prev => ({ ...prev, sku: String(group.sku || '').trim() }));
      }
    } catch (error) {
      console.error('Failed to fetch SKU group products:', error);
      setSkuGroupProducts([]);
      // Show a visible hint so it's not silently "empty" when the API call fails
      setToast({
        message:
          'Could not load variations for this SKU group. Please check the sku-group API endpoint and permissions.',
        type: 'warning',
      });
    } finally {
      setSkuGroupLoading(false);
    }
  };

  /**
   * Sync all images in the current ImageGalleryManager to every variant
   * sharing the same SKU. Only new (non-uploaded) files are sent; existing
   * server images are cleared on the backend inside a DB transaction.
   */
  const handleSyncSkuImages = async () => {
    if (!productId || productImages.length === 0) {
      setToast({ message: 'No images to sync.', type: 'warning' });
      return;
    }

    const files: File[] = [];
    const existingPaths: string[] = [];
    const imageSequence: Array<{ type: 'existing' | 'new'; value: string | number }> = [];
    const altTexts: string[] = [];
    let primaryIndex = 0;

    productImages.forEach((img, idx) => {
      if (img.is_primary) primaryIndex = idx;
      altTexts.push(img.alt_text || '');

      if (img.file && !img.uploaded) {
        // This is a new file
        const fileIdx = files.length;
        files.push(img.file);
        imageSequence.push({ type: 'new', value: fileIdx });
      } else {
        // This is an existing image (already on server)
        // Extract the path from preview/url
        const preview = img.preview || '';
        let path = preview;
        if (preview.includes('/storage/')) {
          path = preview.split('/storage/')[1];
        } else if (preview.startsWith('http')) {
          // If it's a full URL but doesn't have /storage/, try to extract path after domain
          try {
            const url = new URL(preview);
            path = url.pathname.replace(/^\/storage\//, '').replace(/^\//, '');
          } catch (e) {}
        }
        
        existingPaths.push(path);
        imageSequence.push({ type: 'existing', value: path });
      }
    });

    try {
      setSkuImagesSaving(true);
      setToast({ message: 'Syncing images to all SKU variants…', type: 'success' });

      const result = await productImageService.syncSkuImages(
        parseInt(productId!),
        files,
        existingPaths,
        primaryIndex,
        imageSequence,
        altTexts
      );

      setToast({
        message: result.message || `Images synced to ${result.variants_updated} variant(s) successfully!`,
        type: 'success',
      });

      setUpdateImageForEntireSku(false);
      await fetchSkuGroupByProductId(productId);
    } catch (error: any) {
      console.error('Sync SKU images failed:', error);
      setToast({
        message: 'Error updating images for SKU group',
        type: 'error',
      });
    } finally {
      setSkuImagesSaving(false);
    }
  };

  const saveCommonInfo = async () => {
    if (!isEditMode || !productId) return;

    const base_name = String(commonBaseName || '').trim();
    if (!base_name) {
      setToast({ message: 'Base name is required for Common Edit.', type: 'error' });
      return;
    }

    const payload: any = { base_name };

    if (applyCommonDescription) {
      payload.description = String(formData.description || '');
    }

    if (applyCommonCategory) {
      const path = getCategoryPathArray();
      const final = path.length ? parseInt(path[path.length - 1]) : NaN;
      if (!final || Number.isNaN(final)) {
        setToast({ message: 'Select a category first (General Information tab).', type: 'warning' });
        return;
      }
      payload.category_id = final;
    }

    if (applyCommonVendor) {
      const vid = parseInt(String(selectedVendorId || ''));
      if (!vid || Number.isNaN(vid)) {
        setToast({ message: 'Select a vendor first (General Information tab).', type: 'warning' });
        return;
      }
      payload.vendor_id = vid;
    }

    if (applyCommonBrand) {
      payload.brand = String(commonBrand || '').trim();
    }

    try {
      setCommonSaving(true);
      const res = await productService.updateCommonInfo(productId, payload);
      setToast({ message: res?.message || 'Common info updated for all variations.', type: 'success' });

      // Refresh group + current product
      await fetchSkuGroupByProductId(productId);
      await fetchProduct();
    } catch (error: any) {
      console.error('Common edit failed:', error);
      setToast({ message: error?.message || 'Failed to update common info', type: 'error' });
    } finally {
      setCommonSaving(false);
    }
  };

  // -------------------- Variations tab: "old style" quick edit --------------------
  const normalizeSuffix = (suffix: string): string => {
    const raw = String(suffix || '').trim();
    if (!raw) return '';
    return raw.startsWith('-') ? raw : `-${raw}`;
  };

  const updateRowEdit = (id: number, patch: Partial<{ variation_suffix: string; description: string }>) => {
    setRowEdits((prev) => ({
      ...prev,
      [id]: {
        variation_suffix: prev[id]?.variation_suffix ?? '',
        description: prev[id]?.description ?? '',
        ...patch,
      },
    }));
  };

  const saveRow = async (id: number) => {
    const p = skuGroupProducts.find((x) => x.id === id);
    if (!p) return;

    try {
      setSavingRowIds((prev) => ({ ...prev, [id]: true }));

      const base_name = String((p as any).base_name || commonBaseName || formData.name || '').trim();
      const variation_suffix = normalizeSuffix(rowEdits[id]?.variation_suffix ?? String((p as any).variation_suffix || ''));

      const payload: any = {
        // keep backward compatibility: backend can compute name from base_name + variation_suffix
        base_name,
        variation_suffix,
        name: variation_suffix ? `${base_name}${variation_suffix}` : base_name,
        description: rowEdits[id]?.description ?? (p.description || ''),
      };

      await productService.update(id, payload);
      setToast({ message: `Variation #${id} updated.`, type: 'success' });

      // Refresh list so names/images remain accurate
      if (productId) await fetchSkuGroupByProductId(productId);
    } catch (error: any) {
      console.error('Save row failed:', error);
      setToast({ message: error?.message || 'Failed to update variation', type: 'error' });
    } finally {
      setSavingRowIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  const saveAllRows = async () => {
    if (!productId || skuGroupProducts.length === 0) return;
    try {
      setSavingAll(true);
      for (const p of skuGroupProducts) {
        // Save sequentially to avoid rate limits
        await saveRow(p.id);
      }
    } finally {
      setSavingAll(false);
    }
  };
  const openEditProduct = (id: number) => {
    // IMPORTANT: We are already on /product/add. Navigating to the same route is a no-op
    // in Next.js, so we switch modes via state instead of router.push.
    setActiveTab('general');
    setMode('edit');
    setProductId(String(id));

    // keep sessionStorage for compatibility (e.g., if user refreshes)
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('editProductId');
      sessionStorage.removeItem('productMode');
      sessionStorage.removeItem('baseSku');
      sessionStorage.removeItem('baseName');
      sessionStorage.removeItem('categoryId');
      sessionStorage.removeItem('vendorId');

      sessionStorage.setItem('editProductId', String(id));
      sessionStorage.setItem('productMode', 'edit');
    }
  };

  const openAddVariation = (prefillColor?: string) => {
    const sku = String(formData.sku || '').trim();
    if (!sku) {
      setToast({ message: 'SKU is required to add variations', type: 'error' });
      return;
    }

    const baseName = getGroupBaseName(skuGroupProducts, formData.name || '');
    const catId = categorySelection.level0 ? String(categorySelection.level0) : '';
    const vid = selectedVendorId ? String(selectedVendorId) : '';

    // IMPORTANT: We are already on /product/add. Navigating to the same route is a no-op
    // in Next.js, so we switch modes via state instead of router.push.
    setMode('addVariation');
    setProductId(undefined);
    setStoredBaseSku(sku);
    setStoredBaseName(baseName);
    setStoredCategoryId(catId);
    setStoredVendorId(vid);

    // Reset edit-specific state so the form becomes a clean "new variation" form.
    setSelectedFields([]);
    setProductImages([]);
    setVariations([]);

    // Pre-fill the new variation basics
    setFormData({
      name: baseName,
      sku: sku,
      description: '',
    });
    setCategorySelection(catId ? { level0: catId } : {});
    if (vid) setSelectedVendorId(vid);

    setHasVariations(true);

    if (prefillColor) {
      const newVariation: VariationData = {
        id: `var-${Date.now()}-${Math.random()}`,
        color: String(prefillColor),
        sizes: [''],
        images: [],
        imagePreviews: [],
      };
      setVariations([newVariation]);
      setActiveTab('variations');
    } else {
      setActiveTab('general');
    }

    // keep sessionStorage for compatibility (e.g., if user refreshes)
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('editProductId');
      sessionStorage.removeItem('productMode');
      sessionStorage.removeItem('baseSku');
      sessionStorage.removeItem('baseName');
      sessionStorage.removeItem('categoryId');
      sessionStorage.removeItem('vendorId');

      sessionStorage.setItem('productMode', 'addVariation');
      sessionStorage.setItem('baseSku', sku);
      sessionStorage.setItem('baseName', encodeURIComponent(baseName));
      if (catId) sessionStorage.setItem('categoryId', catId);
      if (vid) sessionStorage.setItem('vendorId', vid);
    }
  };

  const getCategoryPathArray = (): string[] => {
    const path: string[] = [];
    let level = 0;
    while (categorySelection[`level${level}`]) {
      path.push(categorySelection[`level${level}`]);
      level++;
    }
    return path;
  };

  const getCategoryPathDisplay = (): string => {
    const path = getCategoryPathArray();
    const names: string[] = [];
    let current: CategoryTree[] = categories;

    for (const id of path) {
      const cat = current.find(c => String(c.id) === String(id));
      if (cat) {
        names.push(cat.title);
        current = cat.children || cat.all_children || [];
      }
    }
    return names.join(' > ') || 'None selected';
  };

  const addField = (field: Field) => {
    const instanceId = `field-${field.id}-${Date.now()}-${Math.random()}`;
    const newFieldValue: FieldValue = {
      fieldId: field.id,
      fieldName: field.title,
      fieldType: field.type,
      value: field.type === 'file' ? [] : '',
      instanceId,
    };
    setSelectedFields([...selectedFields, newFieldValue]);
  };

  const removeField = (instanceId: string) => {
    setSelectedFields(selectedFields.filter(f => f.instanceId !== instanceId));
  };

  const updateFieldValue = (instanceId: string, value: any) => {
    setSelectedFields(selectedFields.map(f =>
      f.instanceId === instanceId ? { ...f, value } : f
    ));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setToast({ message: 'Product name is required', type: 'error' });
      return false;
    }

    // SKU is optional on create (backend will auto-generate). But in edit/add-variation mode,
    // SKU must exist because we manage & group variations by SKU.
    if ((isEditMode || addVariationMode) && !String(formData.sku || '').trim()) {
      setToast({ message: 'SKU is required', type: 'error' });
      return false;
    }

    const categoryPath = getCategoryPathArray();
    if (categoryPath.length === 0) {
      setToast({ message: 'Please select a category', type: 'error' });
      return false;
    }

    // if (!selectedVendorId) {
    //   setToast({ message: 'Please select a vendor', type: 'error' });
    //   return false;
    // }

    if (!isEditMode && hasVariations && variations.length > 0) {
      // Variations are generated from either a Color, a Size, or both.
      // (Color and Size are NOT mandatory; but at least one of them must exist
      // to generate a distinct variant.)
      const hasAnyVariantAttr = variations.some(v =>
        Boolean(String(v.color || '').trim()) ||
        (Array.isArray(v.sizes) && v.sizes.some(s => Boolean(String(s || '').trim())))
      );

      if (!hasAnyVariantAttr) {
        setToast({ message: 'Please add at least one variation attribute (color or size).', type: 'error' });
        return false;
      }

      // When there are multiple variation cards, color is mandatory on each so
      // every variant gets a unique, identifiable name.
      if (variations.length > 1) {
        const missingColor = variations.some(v => !Boolean(String(v.color || '').trim()));
        if (missingColor) {
          setToast({ message: 'Color name is required for each variation when adding more than one variation.', type: 'error' });
          return false;
        }
      }
    }

    return true;
  };

  const addVariation = () => {
    const newVariation: VariationData = {
      id: `var-${Date.now()}-${Math.random()}`,
      color: '',
      sizes: [''],
      images: [],
      imagePreviews: [],
    };
    setVariations([...variations, newVariation]);
  };

  const removeVariation = (variationId: string) => {
    setVariations(variations.filter(v => v.id !== variationId));
  };

  const updateVariationColor = (variationId: string, color: string) => {
    setVariations(variations.map(v =>
      v.id === variationId ? { ...v, color } : v
    ));
  };

  const addSize = (variationId: string) => {
    setVariations(variations.map(v =>
      v.id === variationId ? { ...v, sizes: [...v.sizes, ''] } : v
    ));
  };

  const updateSizeValue = (variationId: string, sizeIndex: number, value: string) => {
    setVariations(variations.map(v =>
      v.id === variationId
        ? { ...v, sizes: v.sizes.map((s, idx) => (idx === sizeIndex ? value : s)) }
        : v
    ));
  };

  const removeSize = (variationId: string, sizeIndex: number) => {
    setVariations(variations.map(v =>
      v.id === variationId
        ? { ...v, sizes: v.sizes.filter((_, idx) => idx !== sizeIndex) }
        : v
    ));
  };

  const updateSizes = (variationId: string, sizes: string[]) => {
    setVariations(variations.map(v =>
      v.id === variationId ? { ...v, sizes } : v
    ));
  };

  const handleCreateSize = async (name: string) => {
    try {
      const newSize = await sizeService.createSize(name);
      setAllSizes(prev => [...prev, newSize]);
      setToast({ message: `Size "${name}" created and added to list.`, type: 'success' });
    } catch (error: any) {
      console.error('Failed to create size:', error);
      const msg = error.response?.data?.errors?.name?.[0] || 'Failed to create size';
      setToast({ message: msg, type: 'error' });
      throw error; // Re-throw so the component can handle UI state
    }
  };

  const handleVariationImageChange = (variationId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length === 0) return;

    const invalidFiles = files.filter(f => !f.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      setToast({ message: 'Only image files are allowed', type: 'error' });
      return;
    }

    const largeFiles = files.filter(f => f.size > 5 * 1024 * 1024);
    if (largeFiles.length > 0) {
      setToast({ message: 'Images must be less than 5MB each', type: 'error' });
      return;
    }

    setVariations(variations.map(v => {
      if (v.id !== variationId) return v;

      const newImages = [...v.images, ...files];
      const newPreviews = [...v.imagePreviews];

      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews.push(reader.result as string);
          setVariations(prevVars =>
            prevVars.map(pv =>
              pv.id === variationId ? { ...pv, imagePreviews: newPreviews } : pv
            )
          );
        };
        reader.readAsDataURL(file);
      });

      return { ...v, images: newImages };
    }));
  };

  const removeVariationImage = (variationId: string, imageIndex: number) => {
    setVariations(variations.map(v =>
      v.id === variationId
        ? {
          ...v,
          images: v.images.filter((_, idx) => idx !== imageIndex),
          imagePreviews: v.imagePreviews.filter((_, idx) => idx !== imageIndex),
        }
        : v
    ));
  };

  const slugify = (val: string): string => {
    return String(val || '').trim();
  };

  const buildVariationSuffix = (color?: string, size?: string): string => {
    const parts: string[] = [];
    const c = slugify(String(color || ''));
    const s = slugify(String(size || ''));
    if (c) parts.push(c);
    if (s) parts.push(s);
    return parts.length ? `-${parts.join('-')}` : '';
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);

      const categoryPath = getCategoryPathArray();
      const finalCategoryId = parseInt(categoryPath[categoryPath.length - 1]);

      const customFields = selectedFields.map(f => ({
        field_id: f.fieldId,
        value: f.value,
      }));

      // ✅ SKU is optional on create. If empty, send null so backend can auto-generate.
      const normalizedSku: string | null = String(formData.sku || '').trim() || null;

      if (isEditMode) {
        const suffix = normalizeSuffix(editVariationSuffix);
        const baseName = String(formData.name || '').trim();

        const updatePayload: any = {
          sku: formData.sku,
          description: formData.description,
          category_id: finalCategoryId,
          vendor_id: parseInt(selectedVendorId),
          custom_fields: customFields,
        };

        // Backward-compatible: always provide name. If we have a suffix, also provide base_name + variation_suffix.
        if (suffix) {
          updatePayload.base_name = baseName;
          updatePayload.variation_suffix = suffix;
          updatePayload.name = `${baseName}${suffix}`;
        } else {
          updatePayload.name = baseName;
        }

        await productService.update(parseInt(productId!), updatePayload);

        setToast({ message: 'Product updated successfully!', type: 'success' });
        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          } else {
            router.push('/product/list');
          }
        }, 1500);
      } else {
        const baseName = String(formData.name || '').trim();

        const baseData = {
          name: baseName, // used for non-variation create (backward compatible)
          base_name: baseName, // used for variation create
          sku: normalizedSku,
          description: formData.description,
          category_id: finalCategoryId,
          vendor_id: parseInt(selectedVendorId),
        };

        if (hasVariations && variations.length > 0) {
          const normTitle = (v: any) => String(v?.title || v?.name || '').trim().toLowerCase();
          const colorField = availableFields.find(f => ['color', 'colour'].includes(normTitle(f)));
          const sizeField = availableFields.find(f => normTitle(f) === 'size');

          const createdProducts: any[] = [];
          const VARIATION_FIELD_IDS = [
            colorField?.id,
            sizeField?.id,
          ].filter(Boolean) as number[];
          const baseCustomFields = customFields.filter(
            cf => !VARIATION_FIELD_IDS.includes(cf.field_id)
          );

          // If SKU is empty, we'll auto-generate ONCE from the first created variation
          // and reuse it for all other variations so they remain grouped by SKU.
          let sharedSku: string | null = normalizedSku;

          // ✅ OPTIMIZED: Prepare all variations first (no API calls)
          const variationsToCreate: Array<{
            variation_suffix: string;
            preview_name: string;
            customFields: any[];
            images: File[];
          }> = [];

          for (const variation of variations) {
            const colorVal = String(variation.color || '').trim();
            const validSizes = (variation.sizes || []).map(s => String(s || '').trim()).filter(Boolean);
            const hasColor = Boolean(colorVal);
            const hasSizes = validSizes.length > 0;

            // If neither color nor size is provided, this variation can't produce a unique product.
            if (!hasColor && !hasSizes) continue;

            const sizesToCreate = hasSizes ? validSizes : [''];

            for (const size of sizesToCreate) {
              const variationSuffix = buildVariationSuffix(variation.color, size);

              const varCustomFields = [...baseCustomFields];

              // Color / Size are optional (only attach the field if both exist and value is non-empty)
              if (colorField && hasColor) {
                varCustomFields.push({ field_id: colorField.id, value: colorVal });
              }

              if (sizeField && size) {
                varCustomFields.push({ field_id: sizeField.id, value: size });
              }

              variationsToCreate.push({
                variation_suffix: variationSuffix,
                preview_name: `${baseData.base_name}${variationSuffix}`,
                customFields: varCustomFields,
                images: variation.images || [],
              });
            }
          }

          // ✅ If SKU was left empty, create ONE seed variation first so backend can
          // generate a SKU, then reuse that SKU for all other variations.
          if (!sharedSku && variationsToCreate.length > 0) {
            const seed = variationsToCreate.shift()!;
            try {
              setToast({ message: 'Generating SKU for variations...', type: 'success' });

              const seedProduct = await productService.create({
                base_name: baseData.base_name,
                variation_suffix: seed.variation_suffix,
                sku: null,
                description: baseData.description,
                category_id: baseData.category_id,
                vendor_id: baseData.vendor_id,
                custom_fields: seed.customFields,
              } as any);

              sharedSku = String((seedProduct as any).sku || '').trim() || null;
              if (sharedSku) {
                // reflect in UI so user can see the generated SKU
                setFormData(prev => ({ ...prev, sku: sharedSku || '' }));
              }

              // Upload seed images
              if (seed.images.length > 0 && (seedProduct as any).id) {
                for (let imgIdx = 0; imgIdx < seed.images.length; imgIdx++) {
                  try {
                    await productImageService.uploadImage(
                      (seedProduct as any).id,
                      seed.images[imgIdx],
                      {
                        is_primary: imgIdx === 0,
                        sort_order: imgIdx,
                      }
                    );
                  } catch (error) {
                    console.error(`Failed to upload seed image ${imgIdx + 1} for ${seed.preview_name}:`, error);
                  }
                }
              }

              createdProducts.push(seedProduct);
              console.log(`✅ Seed variation created: ${seed.preview_name} (generated SKU: ${sharedSku || 'unknown'})`);
            } catch (error) {
              console.error('❌ Failed to create seed variation for SKU generation:', error);
              setToast({ message: 'Failed to generate SKU for variations', type: 'error' });
              setLoading(false);
              return;
            }
          }

          console.log(`🔄 Creating ${variationsToCreate.length} variations...`);

          // Process sequentially without artificial batching/delays.
          // We only wait if the server rate-limits (429), then retry with backoff.
          for (let idx = 0; idx < variationsToCreate.length; idx++) {
            const varData = variationsToCreate[idx];

            setToast({
              message: `Creating variations: ${idx + 1} of ${variationsToCreate.length}...`,
              type: 'success'
            });

            try {
              let product;
              let retryCount = 0;
              const MAX_RETRIES = 3;

              while (retryCount < MAX_RETRIES) {
                try {
                  product = await productService.create({
                    base_name: baseData.base_name,
                    variation_suffix: varData.variation_suffix,
                    sku: sharedSku,
                    description: baseData.description,
                    category_id: baseData.category_id,
                    vendor_id: baseData.vendor_id,
                    custom_fields: varData.customFields,
                  } as any);
                  break;
                } catch (err: any) {
                  retryCount++;
                  if (err.response?.status === 429 && retryCount < MAX_RETRIES) {
                    console.warn(`⚠️ Rate limited, retry ${retryCount}/${MAX_RETRIES} after delay...`);
                    await new Promise(resolve => setTimeout(resolve, 3000 * retryCount));
                  } else {
                    throw err;
                  }
                }
              }

              if (!product) {
                throw new Error('Failed to create product after retries');
              }

              // Upload images sequentially (no artificial delay)
              if (varData.images.length > 0 && product.id) {
                for (let imgIdx = 0; imgIdx < varData.images.length; imgIdx++) {
                  try {
                    await productImageService.uploadImage(
                      product.id,
                      varData.images[imgIdx],
                      {
                        is_primary: imgIdx === 0,
                        sort_order: imgIdx,
                      }
                    );
                  } catch (error) {
                    console.error(`Failed to upload image ${imgIdx + 1} for ${varData.preview_name}:`, error);
                  }
                }
              }

              createdProducts.push(product);
              console.log(`✅ Created variation ${createdProducts.length}/${variationsToCreate.length}: ${varData.preview_name}`);
            } catch (error: any) {
              console.error(`❌ Failed to create variation ${varData.preview_name}:`, error);
              // Continue with next variation instead of failing completely
            }
          }

          if (createdProducts.length === 0) {
            setToast({ message: 'No valid variations were created.', type: 'error' });
            setLoading(false);
            return;
          }

          const failedCount = variationsToCreate.length - createdProducts.length;
          if (failedCount > 0) {
            setToast({
              message: `Created ${createdProducts.length} variations. ${failedCount} failed - please check console for details.`,
              type: 'warning'
            });
          } else {
            setToast({
              message: `Successfully created all ${createdProducts.length} product variations!`,
              type: 'success'
            });
          }
        } else {
          console.log('Step 1: Creating product...');
          const createdProduct = await productService.create({
            ...baseData,
            custom_fields: customFields,
          });

          console.log('Product created with ID:', createdProduct.id);

          if (productImages.length > 0 && createdProduct.id) {
            console.log(`Step 2: Uploading ${productImages.length} images...`);

            let successCount = 0;

            for (let i = 0; i < productImages.length; i++) {
              const imageItem = productImages[i];

              if (imageItem.file && !imageItem.uploaded) {
                try {
                  console.log(`Uploading image ${i + 1}: ${imageItem.file.name}`);

                  await productImageService.uploadImage(
                    createdProduct.id,
                    imageItem.file,
                    {
                      alt_text: imageItem.alt_text || '',
                      is_primary: imageItem.is_primary || (i === 0),
                      sort_order: imageItem.sort_order || i,
                    }
                  );

                  successCount++;
                  console.log(`Image ${i + 1} uploaded and attached successfully`);
                } catch (error) {
                  console.error(`Failed to upload/attach image ${i + 1}:`, error);
                }
              }
            }

            console.log(`Successfully uploaded ${successCount}/${productImages.length} images`);
          }

          setToast({ message: 'Product created successfully!', type: 'success' });
        }

        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          } else {
            router.push('/product/list');
          }
        }, 1500);
      }
    } catch (error: any) {
      console.error('Failed to save product:', error);
      setToast({ message: error.message || 'Failed to save product', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push('/product/list');
    }
  };

  if (loading && !availableFields.length && !categories.length) {
    return (
      <div className={`${darkMode ? 'dark' : ''} flex h-screen`}>
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // In edit mode, we can manage variations by SKU (even if there's currently only one product).
  const showVariationsTab = isEditMode
    ? Boolean(String(formData.sku || '').trim())
    : hasVariations;

  // Permission gate (UI) — backend still enforces permissions.
  if (!modeResolved) {
    return (
      <div className={`${darkMode ? 'dark' : ''} flex h-screen`}>
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Route-level authorization (fully synced with lib/accessMap.ts)
  if (permissionsResolved && !canAccess) {
    return <AccessDenied />;
  }

  return (
    <div className={`${darkMode ? 'dark' : ''} flex h-screen`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="max-w-4xl mx-auto p-6">
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={handleBack}
                className="p-2.5 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-200 dark:border-gray-700 shadow-sm"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {isEditMode ? 'Edit Product' : addVariationMode ? 'Add Product Variation' : 'Add New Product'}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {isEditMode
                    ? 'Update product information'
                    : addVariationMode
                      ? 'Create a new variation for existing product'
                      : 'Create a new product in your catalog'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 mb-6">
              <button
                onClick={() => setActiveTab('general')}
                className={`px-6 py-3 font-medium border-b-2 transition-all ${activeTab === 'general'
                    ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
                  }`}
              >
                General Information
              </button>
              {showVariationsTab && (
                <button
                  onClick={() => setActiveTab('variations')}
                  className={`px-6 py-3 font-medium border-b-2 transition-all ${activeTab === 'variations'
                      ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
                    }`}
                >
                  Product Variations
                  {variations.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full">
                      {variations.length}
                    </span>
                  )}
                </button>
              )}
            </div>

            {activeTab === 'general' && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 space-y-6">
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Basic Information
                    </h2>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Base Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g., saree"
                            disabled={addVariationMode}
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          {isEditMode && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Editing this will change <strong>only this product</strong>. To rename across all variations, use <strong>Common Edit</strong> in the Product Variations tab.
                            </p>
                          )}

                          {isEditMode && (
                            <div className="mt-3">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Variation Suffix <span className="text-gray-500 font-normal">(Optional)</span>
                              </label>
                              <input
                                type="text"
                                value={editVariationSuffix}
                                onChange={(e) => setEditVariationSuffix(e.target.value)}
                                placeholder="e.g., -red-30"
                                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Display name will become: <span className="font-mono">{String(formData.name || '').trim()}{normalizeSuffix(editVariationSuffix)}</span>
                              </p>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            SKU
                            {(isEditMode || addVariationMode) && (
                              <span className="text-red-500"> *</span>
                            )}
                          </label>
                          <input
                            type="text"
                            value={formData.sku}
                            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                            placeholder={
                              isEditMode || addVariationMode
                                ? 'e.g., PROD-001'
                                : 'Leave empty to auto-generate (9 digits)'
                            }
                            // disabled={isEditMode || addVariationMode}
                            disabled={addVariationMode}
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          {(isEditMode || addVariationMode) ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {addVariationMode
                                ? 'All variations share the same SKU'
                                : 'SKU cannot be changed after creation'}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Leave blank and the system will auto-generate a unique 9-digit SKU.
                              {hasVariations ? ' For variations, the first item will generate the SKU and the rest will reuse it.' : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Description
                        </label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          placeholder="Enter product description"
                          rows={4}
                          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <CategoryTreeSelector
                          categories={categories}
                          selectedCategoryId={categorySelection.level0 || ''}
                          onSelect={(categoryId) => {
                            if (categoryId) {
                              setCategorySelection({ level0: categoryId });
                            } else {
                              setCategorySelection({});
                            }
                          }}
                          disabled={addVariationMode}
                        />

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Vendor <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={selectedVendorId}
                            onChange={(e) => setSelectedVendorId(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                          >
                            <option value="">Select vendor</option>
                            {vendors.map((vendor) => (
                              <option key={vendor.id} value={vendor.id}>
                                {vendor.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {!isEditMode && !addVariationMode && (
                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between">
                            <div>
                              <label className="text-sm font-medium text-gray-900 dark:text-white">
                                Create Product with Variations
                              </label>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Enable this to create products with different colors and sizes
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newValue = !hasVariations;
                                setHasVariations(newValue);
                                if (!newValue) {
                                  setVariations([]);
                                }
                              }}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:ring-offset-2 ${hasVariations ? 'bg-gray-900 dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'
                                }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-900 transition-transform ${hasVariations ? 'translate-x-6' : 'translate-x-1'
                                  }`}
                              />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {(isEditMode || (!hasVariations && !addVariationMode)) && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Product Images
                      </h2>

                      {/* ── Update image for entire SKU toggle (edit mode only) ── */}
                      {isEditMode && (
                        <div className="mb-5 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                                Update image for entire SKU
                              </p>
                              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                When <strong>ON</strong>: saving images will{' '}
                                <strong>clear all images from every variant</strong> sharing
                                this SKU and replace them with the images you upload here,
                                in the same order. The primary flag follows your selection.
                                This operation is atomic — all variants update together or
                                none do.
                              </p>
                            </div>
                            {/* Toggle button */}
                            <button
                              id="toggle-update-sku-images"
                              type="button"
                              onClick={() => setUpdateImageForEntireSku((v) => !v)}
                              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${updateImageForEntireSku
                                  ? 'bg-amber-500'
                                  : 'bg-gray-200 dark:bg-gray-700'
                                }`}
                              aria-pressed={updateImageForEntireSku}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${updateImageForEntireSku ? 'translate-x-6' : 'translate-x-1'
                                  }`}
                              />
                            </button>
                          </div>

                          {/* Save SKU images button — only visible when toggle is on */}
                          {updateImageForEntireSku && (
                            <div className="mt-4 flex items-center gap-3">
                              <button
                                id="save-sku-images-btn"
                                type="button"
                                onClick={handleSyncSkuImages}
                                disabled={skuImagesSaving}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                              >
                                {skuImagesSaving ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Syncing…
                                  </>
                                ) : (
                                  'Save Images for Entire SKU'
                                )}
                              </button>
                              <p className="text-xs text-amber-700 dark:text-amber-400">
                                Upload new images below, then click this button to apply them
                                to all variants.
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      <ImageGalleryManager
                        productId={isEditMode ? parseInt(productId!) : undefined}
                        existingImages={editingProduct?.images || []}
                        onImagesChange={(images) => {
                          setProductImages(images);
                        }}
                        maxImages={10}
                        allowReorder={true}
                        disableAutoUpload={updateImageForEntireSku}
                      />
                    </div>
                  )}

                  {hasVariations && !isEditMode && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <p className="text-sm text-blue-800 dark:text-blue-400">
                        <strong>Variations Mode Enabled:</strong> You can upload images for each color variant in the "Product Variations" tab.
                      </p>
                    </div>
                  )}

                  {selectedFields.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Additional Fields
                      </h2>
                      <div className="space-y-4">
                        {selectedFields.map((field) => (
                          <DynamicFieldInput
                            key={field.instanceId}
                            field={field}
                            availableFields={availableFields}
                            onUpdate={(value) => updateFieldValue(field.instanceId, value)}
                            onRemove={() => removeField(field.instanceId)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-1">
                  <div className="sticky top-6">
                    <FieldsSidebar
                      fields={availableFields}
                      selectedFieldIds={selectedFields.map(f => f.fieldId)}
                      onAddField={addField}
                      allowVariantFields={isEditMode}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'variations' && showVariationsTab && (
              <>
                {isEditMode ? (
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            Variations (SKU: <span className="font-mono">{formData.sku}</span>)
                          </h2>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            These are all products that share the same SKU. You can edit any variant, or add new ones.
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setQuickEditMode((v) => !v)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors font-medium"
                          >
                            {quickEditMode ? 'Close Quick Edit' : 'Quick Edit Variations'}
                          </button>

                          <button
                            type="button"
                            onClick={() => openAddVariation()}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors font-medium shadow-sm"
                          >
                            <Plus className="w-4 h-4" />
                            Add Variation
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                      {skuGroupLoading ? (
                        <div className="flex items-center justify-center py-10">
                          <div className="w-10 h-10 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white rounded-full animate-spin"></div>
                        </div>
                      ) : skuGroupProducts.length === 0 ? (
                        <div className="text-center py-10">
                          <p className="text-gray-600 dark:text-gray-400">
                            No other products found for this SKU.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="font-semibold text-gray-900 dark:text-white">Edit Product Group (Common Edit)</div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  Updates base_name (and optional common fields) for <strong>ALL</strong> products in this SKU group.
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={saveCommonInfo}
                                disabled={commonSaving}
                                className="shrink-0 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {commonSaving ? (
                                  <span className="inline-flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                  </span>
                                ) : (
                                  'Save Common Info'
                                )}
                              </button>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                  Base Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={commonBaseName}
                                  onChange={(e) => setCommonBaseName(e.target.value)}
                                  placeholder="e.g., saree"
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Name formula: <span className="font-mono">name = base_name + variation_suffix</span>
                                </p>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                  Brand <span className="text-gray-500 font-normal">(optional)</span>
                                </label>
                                <input
                                  type="text"
                                  value={commonBrand}
                                  onChange={(e) => setCommonBrand(e.target.value)}
                                  disabled={!applyCommonBrand}
                                  placeholder="New Brand"
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 focus:border-transparent dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <label className="mt-2 inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                  <input
                                    type="checkbox"
                                    checked={applyCommonBrand}
                                    onChange={(e) => setApplyCommonBrand(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                                  />
                                  Apply brand to all
                                </label>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-800 dark:text-gray-200">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={applyCommonDescription}
                                  onChange={(e) => setApplyCommonDescription(e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                                />
                                Apply Description (from General tab)
                              </label>

                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={applyCommonCategory}
                                  onChange={(e) => setApplyCommonCategory(e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                                />
                                Apply Category (from General tab)
                              </label>

                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={applyCommonVendor}
                                  onChange={(e) => setApplyCommonVendor(e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                                />
                                Apply Vendor (from General tab)
                              </label>
                            </div>

                            {skuGroupProducts.length > 0 && (
                              <div className="mt-4">
                                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Preview</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {skuGroupProducts.slice(0, 6).map((p) => (
                                    <div key={p.id} className="text-xs text-gray-700 dark:text-gray-300 bg-white/80 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1">
                                      {String(commonBaseName || p.base_name || '').trim() || 'base'}{String((p as any).variation_suffix || '')}
                                    </div>
                                  ))}
                                </div>
                                {skuGroupProducts.length > 6 && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">and {skuGroupProducts.length - 6} more…</div>
                                )}
                              </div>
                            )}
                          </div>

                          {quickEditMode ? (
                            <div className="overflow-x-auto">
                              <div className="flex items-center justify-between mb-3">
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                  Quick edit lets you change <strong>variation suffix</strong> and <strong>description</strong> for each variant from one screen.
                                </div>
                                <button
                                  type="button"
                                  onClick={saveAllRows}
                                  disabled={savingAll}
                                  className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {savingAll ? 'Saving...' : 'Save All'}
                                </button>
                              </div>

                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="text-left text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                    <th className="py-3 pr-4">Image</th>
                                    <th className="py-3 pr-4">Name</th>
                                    <th className="py-3 pr-4">Suffix</th>
                                    <th className="py-3 pr-4">Description</th>
                                    <th className="py-3 pr-4">Color</th>
                                    <th className="py-3 pr-4">Size</th>
                                    <th className="py-3">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {skuGroupProducts.map((p) => {
                                    const v = getVariantAttr(p);
                                    const primary = p.images?.find(img => img.is_primary && img.is_active) ||
                                      p.images?.find(img => img.is_active) ||
                                      p.images?.[0];
                                    const imgUrl = primary ? getImageUrl(primary.image_path) : null;

                                    const edit = rowEdits[p.id] || { variation_suffix: String((p as any).variation_suffix || ''), description: String(p.description || '') };
                                    const basePreview = String(commonBaseName || (p as any).base_name || '').trim();
                                    const suffixPreview = normalizeSuffix(edit.variation_suffix);
                                    const namePreview = suffixPreview ? `${basePreview}${suffixPreview}` : basePreview;

                                    return (
                                      <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700/60 align-top">
                                        <td className="py-3 pr-4">
                                          <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700">
                                            <img
                                              src={imgUrl || FALLBACK_IMAGE_URL}
                                              alt={p.name}
                                              className="w-full h-full object-cover"
                                              onError={(e) => {
                                                e.currentTarget.src = FALLBACK_IMAGE_URL;
                                              }}
                                            />
                                          </div>
                                        </td>
                                        <td className="py-3 pr-4">
                                          <div className="font-medium text-gray-900 dark:text-white">{namePreview || p.name}</div>
                                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">ID: {p.id}</div>
                                        </td>
                                        <td className="py-3 pr-4 min-w-[180px]">
                                          <input
                                            value={edit.variation_suffix}
                                            onChange={(e) => updateRowEdit(p.id, { variation_suffix: e.target.value })}
                                            placeholder="-red-30"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                          />
                                        </td>
                                        <td className="py-3 pr-4 min-w-[280px]">
                                          <input
                                            value={edit.description}
                                            onChange={(e) => updateRowEdit(p.id, { description: e.target.value })}
                                            placeholder="(optional)"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                          />
                                        </td>
                                        <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">{v.color ? String(v.color) : '-'}</td>
                                        <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">{v.size ? String(v.size) : 'One Size'}</td>
                                        <td className="py-3">
                                          <div className="flex flex-wrap gap-2">
                                            <button
                                              type="button"
                                              onClick={() => saveRow(p.id)}
                                              disabled={Boolean(savingRowIds[p.id])}
                                              className="px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              {savingRowIds[p.id] ? 'Saving...' : 'Save'}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => openEditProduct(p.id)}
                                              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors"
                                            >
                                              Full Edit
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => openAddVariation(v.color ? String(v.color) : undefined)}
                                              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                                              title="Create new size variants for this color"
                                            >
                                              Add Sizes
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => router.push(`/product/${p.id}`)}
                                              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                                            >
                                              View
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="text-left text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                    <th className="py-3 pr-4">Image</th>
                                    <th className="py-3 pr-4">Product</th>
                                    <th className="py-3 pr-4">Color</th>
                                    <th className="py-3 pr-4">Size</th>
                                    <th className="py-3">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {skuGroupProducts.map((p) => {
                                    const v = getVariantAttr(p);
                                    const primary = p.images?.find(img => img.is_primary && img.is_active) ||
                                      p.images?.find(img => img.is_active) ||
                                      p.images?.[0];
                                    const imgUrl = primary ? getImageUrl(primary.image_path) : null;

                                    return (
                                      <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700/60">
                                        <td className="py-3 pr-4">
                                          <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700">
                                            <img
                                              src={imgUrl || FALLBACK_IMAGE_URL}
                                              alt={p.name}
                                              className="w-full h-full object-cover"
                                              onError={(e) => {
                                                e.currentTarget.src = FALLBACK_IMAGE_URL;
                                              }}
                                            />
                                          </div>
                                        </td>
                                        <td className="py-3 pr-4">
                                          <div className="font-medium text-gray-900 dark:text-white">
                                            {p.name}
                                          </div>
                                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            ID: {p.id}
                                          </div>
                                        </td>
                                        <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">
                                          {v.color ? String(v.color) : '-'}
                                        </td>
                                        <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">
                                          {v.size ? String(v.size) : 'One Size'}
                                        </td>
                                        <td className="py-3">
                                          <div className="flex gap-2">
                                            <button
                                              type="button"
                                              onClick={() => openEditProduct(p.id)}
                                              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => openAddVariation(v.color ? String(v.color) : undefined)}
                                              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                                              title="Create new size variants for this color"
                                            >
                                              Add Sizes
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => router.push(`/product/${p.id}`)}
                                              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                                            >
                                              View
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}

                      {skuGroupProducts.length === 1 && !skuGroupLoading && (
                        <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                          <p className="text-sm text-blue-800 dark:text-blue-400">
                            Only one product exists for this SKU right now. Use <strong>"Add Variation"</strong> to create more variants.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        Product Variations
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Create variations with different colors and/or sizes. Both are optional — add at least one of them to generate a unique variant.
                      </p>

                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2 text-sm">
                          How Variations Work:
                        </h4>
                        <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                          <li>• All variations use the same SKU: "<strong>{formData.sku || 'Leave empty to auto-generate'}</strong>"</li>
                          <li>• <strong>Color is optional</strong> — you can create size-only variants</li>
                          <li>• <strong>Size is optional</strong> — you can create color-only variants</li>
                          <li>• Each variation card gets one set of images (shared across all sizes in that card)</li>
                          <li>• Name format: "<strong>{formData.name || 'base'}-blue-m</strong>" (base_name + variation_suffix)</li>
                        </ul>
                      </div>
                    </div>

                    {variations.length === 0 ? (
                      <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600">
                        <div className="flex flex-col items-center">
                          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                            <Plus className="w-8 h-8 text-gray-400" />
                          </div>
                          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                            No Variations Yet
                          </h3>
                          <p className="text-gray-500 dark:text-gray-400 mb-6">
                            Click "Add Variation" to create your first product variation
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {variations.map((variation, varIdx) => (
                          <VariationCard
                            key={variation.id}
                            variation={variation}
                            index={varIdx}
                            colorRequired={variations.length > 1}
                            onUpdate={(color) => updateVariationColor(variation.id, color)}
                            onRemove={() => removeVariation(variation.id)}
                            onImageUpload={(e) => handleVariationImageChange(variation.id, e)}
                            onImageRemove={(imgIdx) => removeVariationImage(variation.id, imgIdx)}
                            onSizeAdd={() => addSize(variation.id)}
                            onSizeUpdate={(sizeIdx, value) => updateSizeValue(variation.id, sizeIdx, value)}
                            onSizeRemove={(sizeIdx) => removeSize(variation.id, sizeIdx)}
                            onSizesUpdate={(sizes) => updateSizes(variation.id, sizes)}
                            onCreateSize={handleCreateSize}
                            sizeOptions={getSizeOptionsForVariation(variation.sizes)}
                            sizePresetButtons={sizePresetButtons}
                            onApplySizePreset={(key) => applySizePreset(variation.id, key as SizePresetKey)}
                          />
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={addVariation}
                      className="w-full py-3.5 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Plus className="w-5 h-5" />
                      Add Variation
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3 mt-8 sticky bottom-0 bg-gray-50 dark:bg-gray-900 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-white dark:hover:bg-gray-800 font-medium transition-colors shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white dark:border-gray-900 border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </span>
                ) : isEditMode ? 'Update Product' : 'Create Product'}
              </button>
            </div>
          </div>
        </main>
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