'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import {
  Tag, Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight,
  Percent, DollarSign, Calendar, Package, FolderTree, CheckCircle,
  Zap, Globe, Lock, X, Save, AlertCircle, ChevronDown, ChevronUp,
  ChevronRight, Eye, ZoomIn,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import campaignService, { Campaign, CampaignFormData } from '@/services/campaignService';
import { productService, Product } from '@/services/productService';
import categoryService, { CategoryTree } from '@/services/categoryService';

/* ─────────────────────────────────────────────────────────
   Image helpers — same pattern as purchase-order page
───────────────────────────────────────────────────────── */
const getApiBaseUrl = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || '';
  return raw.replace(/\/api\/?$/, '').replace(/\/$/, '');
};

const toPublicImageUrl = (path?: string | null): string | null => {
  if (!path) return null;
  const p = String(path);
  if (p.startsWith('http')) return p;
  if (p.startsWith('/storage/')) return `${getApiBaseUrl()}${p}`;
  if (p.startsWith('storage/')) return `${getApiBaseUrl()}/${p}`;
  return `${getApiBaseUrl()}/storage/${p.replace(/^\//, '')}`;
};

const pickProductImage = (p: any): string | null => {
  if (!p) return null;
  const direct = p?.image_url || p?.image_path || p?.image || p?.thumbnail;
  if (direct) return toPublicImageUrl(direct);
  const imgs: any[] = p?.images || p?.product_images || [];
  if (imgs.length > 0) {
    const primary = imgs.find((x: any) => x?.is_primary && x?.is_active) || imgs.find((x: any) => x?.is_primary) || imgs[0];
    const url = primary?.image_url || primary?.image_path || primary?.url;
    return toPublicImageUrl(url);
  }
  return null;
};

/* ─────────────────────────────────────────────────────────
   CategoryNode — recursive tree row with checkbox
───────────────────────────────────────────────────────── */
function CategoryNode({
  node, selectedIds, onToggle, depth = 0,
}: {
  node: CategoryTree;
  selectedIds: number[];
  onToggle: (id: number, title: string) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasKids = Array.isArray(node.children) && node.children.length > 0;
  const sel = selectedIds.includes(node.id);

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-lg cursor-pointer transition-colors ${sel ? 'bg-purple-50 dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
        style={{ paddingLeft: `${6 + depth * 14}px`, paddingRight: 6, paddingTop: 5, paddingBottom: 5 }}
      >
        <button type="button" onClick={() => hasKids && setOpen(o => !o)} className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-gray-400 hover:text-gray-600">
          {hasKids ? (open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : <span className="w-3 block" />}
        </button>
        <label className="flex items-center gap-2 flex-1 cursor-pointer select-none min-w-0">
          <input type="checkbox" checked={sel} onChange={() => onToggle(node.id, node.title)} className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer flex-shrink-0" />
          <FolderTree className={`w-3.5 h-3.5 flex-shrink-0 ${sel ? 'text-purple-500' : 'text-gray-400'}`} />
          <span className={`text-xs truncate ${sel ? 'text-purple-700 dark:text-purple-300 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>{node.title}</span>
        </label>
      </div>
      {hasKids && open && node.children.map(child => (
        <CategoryNode key={child.id} node={child} selectedIds={selectedIds} onToggle={onToggle} depth={depth + 1} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Form defaults
───────────────────────────────────────────────────────── */
const EMPTY_FORM: CampaignFormData = {
  name: '', description: '', type: 'percentage', discount_value: 0,
  maximum_discount: undefined, applicable_products: [], applicable_categories: [],
  start_date: new Date().toISOString().slice(0, 16), end_date: '',
  is_active: true, is_automatic: true, is_public: true,
};

/* ─────────────────────────────────────────────────────────
   Page
───────────────────────────────────────────────────────── */
export default function CampaignsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { darkMode, setDarkMode } = useTheme();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterAutomatic, setFilterAutomatic] = useState<boolean | null>(null);
  const [filterActive, setFilterActive] = useState<boolean | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [formData, setFormData] = useState<CampaignFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // product search
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // category tree
  const [categoryTree, setCategoryTree] = useState<CategoryTree[]>([]);
  const [categoryTreeLoading, setCategoryTreeLoading] = useState(false);
  const [showCategoryTree, setShowCategoryTree] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<{ id: number; title: string }[]>([]);
  const [categoryFilterQ, setCategoryFilterQ] = useState('');

  // product image preview
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);

  /* fetch campaigns */
  const fetchCampaigns = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params: any = {};
      if (filterAutomatic !== null) params.is_automatic = filterAutomatic;
      if (filterActive !== null) params.is_active = filterActive;
      const res = await campaignService.getCampaigns({ ...params, search: search.trim() || undefined });
      const list = Array.isArray(res) ? res : (res?.data?.data || res?.data || []);
      setCampaigns(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load campaigns');
      setCampaigns([]);
    } finally { setLoading(false); }
  }, [filterAutomatic, filterActive, search]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  /* load category tree when modal opens */
  useEffect(() => {
    if (!showModal) return;
    setCategoryTreeLoading(true);
    categoryService.getTree(true)
      .then(tree => setCategoryTree(tree || []))
      .catch(() => setCategoryTree([]))
      .finally(() => setCategoryTreeLoading(false));
  }, [showModal]);

  /* product search debounce */
  useEffect(() => {
    if (!productQuery.trim()) { setProductResults([]); setShowProductDropdown(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setProductSearching(true);
      try {
        const res = await productService.getAll({ search: productQuery.trim(), per_page: 12 });
        const list = Array.isArray(res?.data) ? res.data : [];
        setProductResults(list);
        setShowProductDropdown(true);
      } catch { setProductResults([]); }
      finally { setProductSearching(false); }
    }, 300);
  }, [productQuery]);

  /* close dropdown on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (productRef.current && !productRef.current.contains(e.target as Node)) setShowProductDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* modal helpers */
  const resetSelections = () => {
    setSelectedProducts([]); setSelectedCategories([]);
    setProductQuery(''); setCategoryFilterQ('');
    setShowCategoryTree(false); setShowProductDropdown(false);
  };

  const openCreate = () => {
    setEditingCampaign(null); setFormData(EMPTY_FORM); resetSelections(); setFormError(null); setShowModal(true);
  };

  const openEdit = (c: Campaign) => {
    setEditingCampaign(c);
    setFormData({
      name: c.name, description: c.description || '', type: c.type,
      discount_value: c.discount_value, maximum_discount: c.maximum_discount,
      applicable_products: c.applicable_products || [],
      applicable_categories: c.applicable_categories || [],
      start_date: c.start_date?.slice(0, 16) || '', end_date: c.end_date?.slice(0, 16) || '',
      is_active: c.is_active, is_automatic: c.is_automatic, is_public: c.is_public,
    });
    // Placeholder products — will show ID until user re-searches
    setSelectedProducts((c.applicable_products || []).map(id => (
      { id, name: `Product #${id}`, sku: '', category_id: 0, vendor_id: 0, is_archived: false, created_at: '', updated_at: '' } as Product
    )));
    setSelectedCategories((c.applicable_categories || []).map(id => ({ id, title: `Category #${id}` })));
    setProductQuery(''); setCategoryFilterQ(''); setShowCategoryTree(false); setFormError(null); setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingCampaign(null); resetSelections(); };

  /* product selection */
  const addProduct = (p: Product) => {
    if (selectedProducts.find(sp => sp.id === p.id)) return;
    const next = [...selectedProducts, p];
    setSelectedProducts(next);
    setFormData(f => ({ ...f, applicable_products: next.map(x => x.id) }));
    setProductQuery(''); setShowProductDropdown(false);
  };

  const removeProduct = (id: number) => {
    const next = selectedProducts.filter(p => p.id !== id);
    setSelectedProducts(next);
    setFormData(f => ({ ...f, applicable_products: next.map(x => x.id) }));
  };

  /* category selection */
  const toggleCategory = (id: number, title: string) => {
    setSelectedCategories(prev => {
      const next = prev.find(c => c.id === id) ? prev.filter(c => c.id !== id) : [...prev, { id, title }];
      setFormData(f => ({ ...f, applicable_categories: next.map(c => c.id) }));
      return next;
    });
  };

  /* backfill real titles when tree loads */
  useEffect(() => {
    if (!categoryTree.length || !selectedCategories.length) return;
    const flat: CategoryTree[] = [];
    const flatten = (nodes: CategoryTree[]) => { nodes.forEach(n => { flat.push(n); if (n.children) flatten(n.children); }); };
    flatten(categoryTree);
    setSelectedCategories(prev => prev.map(c => { const f = flat.find(n => n.id === c.id); return f ? { id: c.id, title: f.title } : c; }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryTree]);

  /* filter tree by search text */
  const filterTree = (nodes: CategoryTree[], q: string): CategoryTree[] => {
    if (!q.trim()) return nodes;
    return nodes.reduce<CategoryTree[]>((acc, node) => {
      const kids = filterTree(node.children || [], q);
      if (node.title.toLowerCase().includes(q.toLowerCase()) || kids.length > 0) acc.push({ ...node, children: kids });
      return acc;
    }, []);
  };
  const filteredTree = filterTree(categoryTree, categoryFilterQ);

  /* save */
  const handleSave = async () => {
    if (!formData.name.trim()) { setFormError('Campaign name is required'); return; }
    if (!formData.discount_value || formData.discount_value <= 0) { setFormError('Discount value must be greater than 0'); return; }
    setIsSaving(true); setFormError(null);
    try {
      if (editingCampaign) await campaignService.updateCampaign(editingCampaign.id, formData);
      else await campaignService.createCampaign(formData);
      closeModal(); fetchCampaigns();
    } catch (err: any) { setFormError(err?.response?.data?.message || 'Failed to save campaign'); }
    finally { setIsSaving(false); }
  };

  const handleDelete = async (campaign: Campaign) => {
    if (!confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return;
    try { await campaignService.deleteCampaign(campaign.id); fetchCampaigns(); }
    catch (err: any) { alert(err?.response?.data?.message || 'Failed to delete'); }
  };

  const filteredCampaigns = campaigns.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.code?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: campaigns.length,
    active: campaigns.filter(c => c.is_active).length,
    automatic: campaigns.filter(c => c.is_automatic).length,
    expiringSoon: campaigns.filter(c => {
      if (!c.end_date) return false;
      const diff = new Date(c.end_date).getTime() - Date.now();
      return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
    }).length,
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'No end date';
    return new Date(date).toLocaleDateString('en-BD', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const isCampaignLive = (c: Campaign) => {
    if (!c.is_active) return false;
    const now = Date.now(), start = new Date(c.start_date).getTime(), end = c.end_date ? new Date(c.end_date).getTime() : Infinity;
    return start <= now && now <= end;
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header toggleSidebar={() => setSidebarOpen(!sidebarOpen)} darkMode={darkMode} setDarkMode={setDarkMode} />
          <main className="flex-1 overflow-y-auto p-6">

            {/* header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Tag className="w-7 h-7 text-indigo-600" />Sale Campaigns</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage automatic discounts and promotional campaigns</p>
              </div>
              <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
                <Plus className="w-4 h-4" />New Campaign
              </button>
            </div>

            {/* stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total', value: stats.total, icon: Tag, color: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' },
                { label: 'Active', value: stats.active, icon: CheckCircle, color: 'bg-green-50 dark:bg-green-900/20 text-green-600' },
                { label: 'Automatic', value: stats.automatic, icon: Zap, color: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600' },
                { label: 'Expiring Soon', value: stats.expiringSoon, icon: Calendar, color: 'bg-red-50 dark:bg-red-900/20 text-red-600' },
              ].map(s => (
                <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${s.color}`}><s.icon className="w-5 h-5" /></div>
                  <div><p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p><p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p></div>
                </div>
              ))}
            </div>

            {/* filters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Search campaigns…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex gap-2">
                <select value={filterAutomatic === null ? '' : String(filterAutomatic)} onChange={e => setFilterAutomatic(e.target.value === '' ? null : e.target.value === 'true')} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="">All Types</option><option value="true">Automatic</option><option value="false">Coupon</option>
                </select>
                <select value={filterActive === null ? '' : String(filterActive)} onChange={e => setFilterActive(e.target.value === '' ? null : e.target.value === 'true')} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="">All Status</option><option value="true">Active</option><option value="false">Inactive</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl p-4 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" /><span className="text-sm">{error}</span>
              </div>
            )}

            {/* table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" /></div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="text-center py-16">
                  <Tag className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No campaigns found</p>
                  <button onClick={openCreate} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Create Campaign</button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                        {['Campaign', 'Discount', 'Target', 'Duration', 'Status', ''].map((h, i) => (
                          <th key={i} className={`px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {filteredCampaigns.map(campaign => (
                        <tr key={campaign.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900 dark:text-white truncate max-w-[180px]">{campaign.name}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded">{campaign.code}</span>
                              {campaign.is_automatic && <span className="text-xs bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Zap className="w-3 h-3" />Auto</span>}
                              {campaign.is_public
                                ? <span className="text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Globe className="w-3 h-3" />Public</span>
                                : <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Lock className="w-3 h-3" />Private</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${campaign.type === 'percentage' ? 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600' : 'bg-green-100 dark:bg-green-900/20 text-green-600'}`}>
                                {campaign.type === 'percentage' ? <Percent className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
                              </span>
                              <div>
                                <p className="font-semibold text-gray-900 dark:text-white">{campaign.type === 'percentage' ? `${campaign.discount_value}%` : `৳${campaign.discount_value}`}</p>
                                {campaign.maximum_discount ? <p className="text-xs text-gray-400">Max ৳{campaign.maximum_discount}</p> : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {campaign.applicable_products?.length ? (
                                <span className="text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full w-fit flex items-center gap-1"><Package className="w-3 h-3" />{campaign.applicable_products.length} product{campaign.applicable_products.length !== 1 ? 's' : ''}</span>
                              ) : null}
                              {campaign.applicable_categories?.length ? (
                                <span className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-600 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-full w-fit flex items-center gap-1"><FolderTree className="w-3 h-3" />{campaign.applicable_categories.length} categor{campaign.applicable_categories.length !== 1 ? 'ies' : 'y'}</span>
                              ) : null}
                              {!campaign.applicable_products?.length && !campaign.applicable_categories?.length && <span className="text-xs text-gray-400 italic">All products</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400"><Calendar className="w-3.5 h-3.5" />{formatDate(campaign.start_date)}</div>
                            <p className="text-xs text-gray-400 mt-0.5 pl-4">→ {formatDate(campaign.end_date)}</p>
                          </td>
                          <td className="px-4 py-3">
                            {isCampaignLive(campaign)
                              ? <span className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />Live</span>
                              : campaign.is_active
                                ? <span className="text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">Scheduled</span>
                                : <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">Inactive</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEdit(campaign)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleDelete(campaign)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          CREATE / EDIT MODAL
      ══════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Tag className="w-5 h-5 text-indigo-600" />{editingCampaign ? 'Edit Campaign' : 'New Campaign'}</h2>
              <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {formError && (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg p-3 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{formError}
                </div>
              )}

              {/* Name + desc */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">Campaign Name *</label>
                  <input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Summer Sale 20%" className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">Description</label>
                  <input value={formData.description || ''} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>

              {/* Discount */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">Type *</label>
                  <select value={formData.type} onChange={e => setFormData(f => ({ ...f, type: e.target.value as 'percentage' | 'fixed' }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    <option value="percentage">Percentage (%)</option><option value="fixed">Fixed (৳)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">Value {formData.type === 'percentage' ? '(%)' : '(৳)'} *</label>
                  <input type="number" value={formData.discount_value || ''} onChange={e => setFormData(f => ({ ...f, discount_value: parseFloat(e.target.value) || 0 }))} min="0" step={formData.type === 'percentage' ? '1' : '0.01'} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">Max Discount (৳)</label>
                  <input type="number" value={formData.maximum_discount || ''} onChange={e => setFormData(f => ({ ...f, maximum_discount: parseFloat(e.target.value) || undefined }))} min="0" placeholder="No cap" className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">Start Date *</label>
                  <input type="datetime-local" value={formData.start_date} onChange={e => setFormData(f => ({ ...f, start_date: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">End Date <span className="font-normal normal-case text-gray-400">(optional)</span></label>
                  <input type="datetime-local" value={formData.end_date || ''} onChange={e => setFormData(f => ({ ...f, end_date: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>

              {/* ── PRODUCTS ───────────────────────────────── */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-indigo-500" />Applicable Products
                  <span className="font-normal normal-case text-gray-400">— leave empty to apply to all products</span>
                </label>

                <div ref={productRef} className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={productQuery}
                      onChange={e => setProductQuery(e.target.value)}
                      onFocus={() => productResults.length > 0 && setShowProductDropdown(true)}
                      placeholder="Search by product name or SKU…"
                      className="w-full pl-9 pr-8 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    {productSearching ? (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    ) : productQuery ? (
                      <button type="button" onClick={() => { setProductQuery(''); setProductResults([]); setShowProductDropdown(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>

                  {/* Dropdown */}
                  {showProductDropdown && productResults.length > 0 && (
                    <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      {productResults.map(p => {
                        const imgUrl = pickProductImage(p) || "/placeholder-image.jpg";
                        const already = !!selectedProducts.find(sp => sp.id === p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => !already && addProduct(p)}
                            disabled={already}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${already ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-700/50' : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer'}`}
                          >
                            <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                              <img src={imgUrl} alt={p.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = '/placeholder-image.jpg'; }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                              <p className="text-xs text-gray-400 truncate">SKU: {p.sku}{p.category?.title ? ` · ${p.category.title}` : ''}</p>
                            </div>
                            {already && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {showProductDropdown && !productSearching && productResults.length === 0 && productQuery.trim() && (
                    <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl px-4 py-3 text-sm text-gray-400 text-center">
                      No products found for "{productQuery}"
                    </div>
                  )}
                </div>

                {/* Selected chips */}
                {selectedProducts.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {selectedProducts.map(p => {
                      const imgUrl = pickProductImage(p) || "/placeholder-image.jpg";
                      return (
                        <div key={p.id} className="group flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 rounded-lg pl-1 pr-2 py-1 shadow-sm">
                          <button type="button" onClick={() => setPreviewProduct(p)} className="relative w-7 h-7 rounded overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-700" title="View image">
                            <img src={imgUrl} alt={p.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = '/placeholder-image.jpg'; }} />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                              <ZoomIn className="w-3 h-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </button>
                          <span className="text-xs font-medium text-gray-800 dark:text-gray-200 max-w-[120px] truncate">{p.name}</span>
                          <button type="button" onClick={() => setPreviewProduct(p)} className="text-gray-300 hover:text-indigo-500 transition-colors" title="View">
                            <Eye className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => removeProduct(p.id)} className="text-gray-300 hover:text-red-500 transition-colors" title="Remove">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── CATEGORIES ─────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                    <FolderTree className="w-3.5 h-3.5 text-purple-500" />Applicable Categories
                    <span className="font-normal normal-case text-gray-400">— leave empty to apply to all</span>
                  </label>
                  <button type="button" onClick={() => setShowCategoryTree(v => !v)} className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 font-medium">
                    {showCategoryTree ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {showCategoryTree ? 'Hide' : 'Browse tree'}
                  </button>
                </div>

                {/* Selected chips */}
                {selectedCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedCategories.map(c => (
                      <span key={c.id} className="flex items-center gap-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs px-2 py-1 rounded-full">
                        <FolderTree className="w-3 h-3 flex-shrink-0" />
                        <span className="max-w-[140px] truncate">{c.title}</span>
                        <button type="button" onClick={() => toggleCategory(c.id, c.title)} className="hover:text-red-500 transition-colors ml-0.5 flex-shrink-0"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Tree panel */}
                {showCategoryTree && (
                  <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                    <div className="p-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-600">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <input type="text" value={categoryFilterQ} onChange={e => setCategoryFilterQ(e.target.value)} placeholder="Filter categories…" className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                        {categoryFilterQ && (
                          <button type="button" onClick={() => setCategoryFilterQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto p-1.5 bg-white dark:bg-gray-900">
                      {categoryTreeLoading ? (
                        <div className="flex items-center justify-center py-6 gap-2 text-gray-400">
                          <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs">Loading…</span>
                        </div>
                      ) : filteredTree.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-5">{categoryFilterQ ? `No categories match "${categoryFilterQ}"` : 'No categories found'}</p>
                      ) : (
                        filteredTree.map(node => (
                          <CategoryNode key={node.id} node={node} selectedIds={selectedCategories.map(c => c.id)} onToggle={toggleCategory} />
                        ))
                      )}
                    </div>
                    {selectedCategories.length > 0 && (
                      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-600 bg-purple-50 dark:bg-purple-900/10 flex items-center justify-between">
                        <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">{selectedCategories.length} selected</span>
                        <button type="button" onClick={() => { setSelectedCategories([]); setFormData(f => ({ ...f, applicable_categories: [] })); }} className="text-xs text-red-500 hover:text-red-600 transition-colors">Clear all</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { key: 'is_automatic', label: 'Auto Discount', desc: 'No code needed', icon: Zap, active: 'border-yellow-400 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-900/10', ic: 'text-yellow-500' },
                  { key: 'is_public', label: 'Public', desc: 'Visible in public API', icon: Globe, active: 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/10', ic: 'text-blue-500' },
                  { key: 'is_active', label: 'Active', desc: 'Enable campaign', icon: CheckCircle, active: 'border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-900/10', ic: 'text-green-500' },
                ].map(t => {
                  const isOn = formData[t.key as keyof CampaignFormData] as boolean;
                  const Icon = t.icon;
                  return (
                    <button key={t.key} type="button" onClick={() => setFormData(f => ({ ...f, [t.key]: !isOn }))} className={`p-3 rounded-xl border-2 text-left transition-all ${isOn ? t.active : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <Icon className={`w-4 h-4 ${isOn ? t.ic : 'text-gray-400'}`} />
                        {isOn ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                      </div>
                      <p className={`text-xs font-semibold ${isOn ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>{t.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{t.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end flex-shrink-0">
              <button onClick={closeModal} className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                <Save className="w-4 h-4" />{isSaving ? 'Saving…' : editingCampaign ? 'Save Changes' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          PRODUCT IMAGE PREVIEW MODAL
      ══════════════════════════════════════════════ */}
      {previewProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm" onClick={() => setPreviewProduct(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-xs w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            {(() => {
              const imgUrl = pickProductImage(previewProduct) || "/placeholder-image.jpg";
              return (
                <div className="relative bg-gray-100 dark:bg-gray-800 min-h-[180px] flex items-center justify-center">
                  <img src={imgUrl} alt={previewProduct.name} className="w-full max-h-72 object-contain" onError={e => { (e.target as HTMLImageElement).src = '/placeholder-image.jpg'; }} />
                  {imgUrl !== '/placeholder-image.jpg' && (
                    <a href={imgUrl} target="_blank" rel="noopener noreferrer" className="absolute top-2 right-2 p-1.5 bg-white/80 dark:bg-gray-900/80 rounded-lg hover:bg-white dark:hover:bg-gray-900 shadow-sm" title="Open full image">
                      <ZoomIn className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                    </a>
                  )}
                </div>
              );
            })()}
            <div className="p-4">
              <p className="font-semibold text-gray-900 dark:text-white leading-snug">{previewProduct.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">SKU: {previewProduct.sku}</p>
              {previewProduct.category?.title && (
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><FolderTree className="w-3 h-3" />{previewProduct.category.title}</p>
              )}
            </div>
            <div className="px-4 pb-4">
              <button onClick={() => setPreviewProduct(null)} className="w-full py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
