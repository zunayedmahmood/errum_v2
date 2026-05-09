"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Save, Loader2, Image as ImageIcon, Upload, X, Search, Package, Plus, Trash2, GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Toast from "@/components/Toast";
import collectionService, { Collection } from "@/services/collectionService";
import catalogService from "@/services/catalogService";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

export default function EditCollectionPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  
  const { isRole, isLoading: authLoading } = useAuth();
  const isPowerUser = isRole(['super-admin', 'admin', 'online-moderator']);
  
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  } | null>(null);

  const [formData, setFormData] = useState<Partial<Collection>>({
    name: "",
    slug: "",
    description: "",
    type: "season",
    status: "draft",
    sort_order: 0,
  });

  const [images, setImages] = useState<{
    thumbnail: File | null;
    banner: File | null;
  }>({
    thumbnail: null,
    banner: null,
  });

  const [previews, setPreviews] = useState<{
    thumbnail: string | null;
    banner: string | null;
  }>({
    thumbnail: null,
    banner: null,
  });

  const [products, setProducts] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (id) {
      loadCollection();
      loadProducts();
    }
  }, [id]);

  const loadCollection = async () => {
    try {
      setLoading(true);
      const data = await collectionService.getById(id);
      setFormData(data);
      setPreviews({
        thumbnail: data.thumbnail_url,
        banner: data.banner_url,
      });
    } catch (error: any) {
      console.error('Failed to load collection:', error);
      showToast('Failed to load collection details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const data = await collectionService.getProducts(id);
      setProducts(data.data || []);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === "name") {
        next.slug = value.trim().toLowerCase().split(/\s+/).join("-").replace(/[^a-z0-9-]/g, "");
      }
      return next;
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'thumbnail' | 'banner') => {
    const file = e.target.files?.[0];
    if (file) {
      setImages(prev => ({ ...prev, [type]: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews(prev => ({ ...prev, [type]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (type: 'thumbnail' | 'banner') => {
    setImages(prev => ({ ...prev, [type]: null }));
    setPreviews(prev => ({ ...prev, [type]: null }));
    // We'll need a way to tell the backend to clear the image if it was existing
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    try {
      setSaving(true);
      const data = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          data.append(key, String(value));
        }
      });
      
      if (images.thumbnail) data.append('thumbnail_image', images.thumbnail);
      if (images.banner) data.append('banner_image', images.banner);
      
      // If image was cleared
      if (!previews.thumbnail && !images.thumbnail) data.append('remove_thumbnail', '1');
      if (!previews.banner && !images.banner) data.append('remove_banner', '1');

      await collectionService.update(id, data);
      showToast('Collection updated successfully!', 'success');
    } catch (error: any) {
      console.error('Failed to update collection:', error);
      showToast(error.response?.data?.message || 'Failed to update collection', 'error');
    } finally {
      setSaving(false);
    }
  };

  const searchCollectionProducts = async (q: string) => {
    setSearchQuery(q);
    if (!q || q.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const response = await catalogService.getProducts({
        search: q,
        group_by_sku: true,
        per_page: 20
      });
      
      const displayProducts = response.grouped_products?.length
        ? response.grouped_products.map(gp => gp.main_variant)
        : response.products;

      setSearchResults(displayProducts || []);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const addProductToCollection = async (product: any) => {
    try {
      await collectionService.addProducts(id, [product.id]);
      showToast(`${product.base_name || product.name} added to collection`);
      loadProducts();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to add product', 'error');
    }
  };

  const removeProductFromCollection = async (productId: number) => {
    try {
      await collectionService.removeProduct(id, productId);
      showToast('Product removed from collection');
      loadProducts();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to remove product', 'error');
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToast({ message, type });
  };

  if (authLoading || loading) return null;
  if (!isPowerUser) return null;

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-6xl mx-auto pb-20">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Link
                    href="/collections"
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500 dark:text-gray-400"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Link>
                  <div>
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">
                      Edit Collection
                    </h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      ID: #{id} — {formData.name}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSubmit}
                    disabled={saving || !formData.name}
                    className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Update Collection
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Form Details */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Basic Info */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
                      General Information
                    </h2>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Collection Name
                          </label>
                          <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Description
                        </label>
                        <textarea
                          name="description"
                          value={formData.description || ""}
                          onChange={handleInputChange}
                          rows={3}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Product Management */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                        Manage Products ({products.length})
                      </h2>
                      <button 
                        onClick={() => setShowSearch(true)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1.5 hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" /> Browse & Add Products
                      </button>
                    </div>

                    <div className="space-y-2">
                      {products.length === 0 ? (
                        <div className="text-center py-10 bg-gray-50 dark:bg-gray-900/50 rounded-lg border-2 border-dashed border-gray-100 dark:border-gray-700">
                          <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">No products in this collection yet.</p>
                        </div>
                      ) : (
                        products.map((product) => (
                          <div key={product.id} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg group">
                            <div className="w-10 h-10 rounded overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0">
                              {product.images?.[0]?.image_url ? (
                                <img src={product.images[0].image_url} className="w-full h-full object-cover" alt="" />
                              ) : (
                                <Package className="w-full h-full p-2 text-gray-300" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{product.base_name || product.name}</p>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wider">{product.sku}</p>
                            </div>
                            <button 
                              onClick={() => removeProductFromCollection(product.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Images & Meta */}
                <div className="space-y-6">
                  {/* Status & Type */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
                      Settings
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                        <select
                          name="status"
                          value={formData.status}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="draft">Draft</option>
                          <option value="active">Active</option>
                          <option value="archived">Archived</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Images */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
                      Collection Assets
                    </h2>
                    
                    <div className="space-y-6">
                      {/* Thumbnail */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-tight">Thumbnail</label>
                        {previews.thumbnail ? (
                          <div className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                            <img src={previews.thumbnail} className="w-full h-full object-cover" alt="" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <label className="p-2 bg-white text-gray-900 rounded-lg cursor-pointer hover:bg-gray-100">
                                <Upload className="w-4 h-4" />
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageChange(e, 'thumbnail')} />
                              </label>
                              <button 
                                onClick={() => removeImage('thumbnail')}
                                className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center aspect-square w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-all">
                            <ImageIcon className="w-6 h-6 text-gray-400 mb-2" />
                            <span className="text-[10px] text-gray-500">Upload Thumbnail</span>
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageChange(e, 'thumbnail')} />
                          </label>
                        )}
                      </div>

                      {/* Banner */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-tight">Banner</label>
                        {previews.banner ? (
                          <div className="relative group aspect-[16/7] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                            <img src={previews.banner} className="w-full h-full object-cover" alt="" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <label className="p-2 bg-white text-gray-900 rounded-lg cursor-pointer hover:bg-gray-100">
                                <Upload className="w-4 h-4" />
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageChange(e, 'banner')} />
                              </label>
                              <button 
                                onClick={() => removeImage('banner')}
                                className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center aspect-[16/7] w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-all">
                            <ImageIcon className="w-6 h-6 text-gray-400 mb-2" />
                            <span className="text-[10px] text-gray-500">Upload Banner</span>
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageChange(e, 'banner')} />
                          </label>
                        )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </main>
        </div>
      </div>

      {/* Product Search Modal */}
      {showSearch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Browse Products</h3>
              <button onClick={() => setShowSearch(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search by product name or SKU..."
                  value={searchQuery}
                  onChange={(e) => searchCollectionProducts(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  <p className="text-xs text-gray-500">Searching products...</p>
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((product) => {
                  const isAlreadyAdded = products.some(p => p.id === product.id);
                  return (
                    <div key={product.id} className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl hover:border-blue-200 dark:hover:border-blue-900 transition-all">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                        {product.images?.[0]?.image_url ? (
                          <img src={product.images[0].image_url} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <Package className="w-full h-full p-2.5 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{product.base_name || product.name}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest">{product.sku}</p>
                      </div>
                      <button 
                        onClick={() => !isAlreadyAdded && addProductToCollection(product)}
                        disabled={isAlreadyAdded}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          isAlreadyAdded 
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-default' 
                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200 dark:shadow-none'
                        }`}
                      >
                        {isAlreadyAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })
              ) : searchQuery.length >= 2 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-500">No products found for "{searchQuery}"</p>
                </div>
              ) : (
                <div className="text-center py-10">
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">Type to search catalog</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
